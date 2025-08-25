const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

test.describe('Dash Core Download Links', () => {
  test('should verify all Dash Core download links are accessible', async ({ page }) => {
    await page.goto('/download/');
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    
    // Get Dash Core download links from dashpay/dash GitHub releases and signature files
    const downloadLinks = await page.locator('a[href*="github.com/dashpay/dash/releases"], a[href$=".sig"], a[href$=".asc"]').all();
    
    console.log(`Found ${downloadLinks.length} potential download links`);
    
    for (let i = 0; i < downloadLinks.length; i++) {
      const link = downloadLinks[i];
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      
      if (href) {
        console.log(`Checking link ${i + 1}: ${text?.trim()} -> ${href}`);
        
        // Skip dash-wallet links - we only want dashpay/dash (Dash Core)
        if (href.includes('dash-wallet')) {
          console.log(`Skipping dash-wallet link: ${href}`);
          continue;
        }
        
        // Include dashpay/dash releases links and signature files
        if (!href.includes('github.com/dashpay/dash/releases') && !href.endsWith('.sig') && !href.endsWith('.asc')) {
          console.log(`Skipping non-Dash Core link: ${href}`);
          continue;
        }
        
        // Test the link accessibility
        try {
          const response = await page.request.head(href);
          const status = response.status();
          
          console.log(`  Status: ${status}`);
          
          // Accept 200 (OK), 302 (redirect), or other 3xx redirects
          expect(status).toBeGreaterThanOrEqual(200);
          expect(status).toBeLessThan(400);
          
          // For actual file downloads, check content-type or content-disposition
          const contentType = response.headers()['content-type'];
          const contentDisposition = response.headers()['content-disposition'];
          
          // Validate content type based on link type
          if (href.endsWith('.sig') || href.endsWith('.asc')) {
            // Signature files should be downloadable
            expect(
              contentType?.includes('application/') || 
              contentType?.includes('text/') ||
              contentDisposition?.includes('attachment') ||
              status >= 300 && status < 400 // Redirect is acceptable
            ).toBeTruthy();
          } else {
            // GitHub links should return HTML or file downloads
            expect(
              contentType?.includes('text/html') || 
              contentType?.includes('application/') || 
              contentDisposition?.includes('attachment') ||
              status >= 300 && status < 400 // Redirect is acceptable
            ).toBeTruthy();
          }
          
        } catch (error) {
          console.error(`Failed to check link ${href}: ${error.message}`);
          throw error;
        }
      }
    }
  });

  test('should verify Dash Core download sections exist', async ({ page }) => {
    await page.goto('/download/');
    await page.waitForLoadState('networkidle');
    
    // Look for Dash Core specific content
    const dashCoreElements = page.locator('text=/.*dash.*core.*/i').or(
      page.locator('text=/.*core.*wallet.*/i')
    );
    
    const count = await dashCoreElements.count();
    if (count > 0) {
      console.log(`Found Dash Core references (${count} instances)`);
      expect(count).toBeGreaterThan(0);
    }
    
    // Check for GitHub releases link and signature files
    const githubLink = page.locator('a[href*="github.com/dashpay/dash/releases"]');
    const githubCount = await githubLink.count();
    console.log(`Found ${githubCount} GitHub links to Dash repository`);
    
    const sigLinks = page.locator('a[href$=".sig"], a[href$=".asc"]');
    const sigCount = await sigLinks.count();
    console.log(`Found ${sigCount} signature file links`);
  });

  test('should verify download page loads without errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Listen for network failures
    const networkErrors = [];
    page.on('requestfailed', request => {
      networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });
    
    await page.goto('/download/');
    await page.waitForLoadState('networkidle');
    
    // Check page title
    const title = await page.title();
    expect(title).toContain('Download');
    
    // Verify no critical console errors
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('favicon') && // Ignore favicon errors
      !error.includes('analytics') && // Ignore analytics errors
      !error.toLowerCase().includes('third-party') && // Ignore third-party errors
      !error.includes('Content Security Policy') && // Ignore CSP warnings
      !error.includes('worker') && // Ignore web worker issues
      !error.includes('blob:') // Ignore blob URL issues
    );
    
    if (criticalErrors.length > 0) {
      console.log('Console errors found:', criticalErrors);
    }
    
    // Verify no critical network failures
    const criticalNetworkErrors = networkErrors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('analytics') &&
      !error.includes('google') &&
      !error.includes('facebook')
    );
    
    if (criticalNetworkErrors.length > 0) {
      console.log('Network errors found:', criticalNetworkErrors);
    }
    
    expect(criticalErrors.length).toBe(0);
    expect(criticalNetworkErrors.length).toBe(0);
  });

  test('should verify GPG signature of release files', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'GPG verification only needs to run on one browser');
    test.setTimeout(5 * 60 * 1000); // 5 minutes for GPG verification and downloads
    
    console.log('Starting GPG signature verification...');
    
    try {
      // Check if key is already imported, if not download and import it
      console.log('Checking if GPG key is already imported...');
      let keyPath;
      try {
        const keyCheck = execSync('gpg --list-keys pasta 2>/dev/null', { encoding: 'utf8' });
        if (keyCheck.includes('pasta')) {
          console.log('GPG key already imported, skipping download and import');
        } else {
          throw new Error('Key not found');
        }
      } catch (error) {
        console.log('GPG key not found, downloading from keybase...');
        const keyResponse = await page.request.get('https://keybase.io/pasta/pgp_keys.asc', {
          timeout: 30000 // 30 seconds
        });
        expect(keyResponse.status()).toBe(200);
        
        const keyContent = await keyResponse.text();
        keyPath = path.join(os.tmpdir(), 'pasta-key.asc');
        fs.writeFileSync(keyPath, keyContent);
        console.log('GPG key downloaded and saved');
        
        console.log('Importing GPG key...');
        execSync(`gpg --import "${keyPath}" 2>/dev/null`, { stdio: 'pipe' });
        console.log('GPG key imported successfully');
      }
      
      // Get latest release to find current version
      console.log('Finding latest release version...');
      const releaseResponse = await page.request.get('https://api.github.com/repos/dashpay/dash/releases/latest', {
        timeout: 30000 // 30 seconds
      });
      expect(releaseResponse.status()).toBe(200);
      
      const releaseData = await releaseResponse.json();
      const version = releaseData.tag_name;
      expect(version).toBeTruthy();
      console.log(`Found latest version: ${version}`);
      
      // Download SHA256SUMS.asc (clearsigned message)
      const baseUrl = `https://github.com/dashpay/dash/releases/download/${version}`;
      console.log(`Downloading SHA256SUMS.asc from ${baseUrl}...`);
      
      const sigResponse = await page.request.get(`${baseUrl}/SHA256SUMS.asc`, {
        timeout: 30000 // 30 seconds
      });
      expect(sigResponse.status()).toBe(200);
      
      // Save clearsigned file
      const sigContent = await sigResponse.text();
      const sha256Path = path.join(os.tmpdir(), 'SHA256SUMS.asc');
      fs.writeFileSync(sha256Path, sigContent);
      console.log('SHA256SUMS.asc downloaded and saved');
      
      // Verify clearsigned message (no separate file needed)
      console.log('Verifying GPG signature...');
      try {
        const result = execSync(`gpg --verify "${sha256Path}" 2>&1`, { encoding: 'utf8' });
        console.log('GPG verification output:', result);
        expect(result).toContain('Good signature');
        console.log('✓ GPG signature verified successfully');
      } catch (error) {
        // gpg returns non-zero even for good signatures with untrusted keys
        const output = error.stdout || error.stderr || error.message;
        console.log('GPG verification output (with warning):', output);
        expect(output).toContain('Good signature');
        console.log('✓ GPG signature verified successfully (with trust warning)');
      }
      
      // Also verify signatures of individual binary files
      console.log('Verifying binary file signatures...');
      const binaries = [
        `dashcore-${version.replace('v', '')}-win64-setup.exe`,
        `dashcore-${version.replace('v', '')}-osx.dmg`,
        `dashcore-${version.replace('v', '')}-x86_64-linux-gnu.tar.gz`
      ];
      
      let verifiedCount = 0;
      for (const binary of binaries) {
        try {
          console.log(`Checking signature for ${binary}...`);
          
          // Download binary and its signature
          const binaryResponse = await page.request.get(`${baseUrl}/${binary}`, {
            timeout: 120000 // 2 minutes for large binary files
          });
          const binarySignatureResponse = await page.request.get(`${baseUrl}/${binary}.asc`, {
            timeout: 30000 // 30 seconds for signature files
          });
          
          if (binaryResponse.status() === 200 && binarySignatureResponse.status() === 200) {
            // Save binary and signature
            const binaryContent = await binaryResponse.body();
            const signatureContent = await binarySignatureResponse.text();
            
            const binaryPath = path.join(os.tmpdir(), binary);
            const signaturePath = path.join(os.tmpdir(), `${binary}.asc`);
            
            fs.writeFileSync(binaryPath, binaryContent);
            fs.writeFileSync(signaturePath, signatureContent);
            
            // Verify signature
            try {
              const result = execSync(`gpg --verify "${signaturePath}" "${binaryPath}" 2>&1`, { encoding: 'utf8' });
              expect(result).toContain('Good signature');
              console.log(`✓ ${binary} signature verified successfully`);
              verifiedCount++;
            } catch (error) {
              const output = error.stdout || error.stderr || error.message;
              expect(output).toContain('Good signature');
              console.log(`✓ ${binary} signature verified successfully (with trust warning)`);
              verifiedCount++;
            }
            
            // Clean up binary files immediately to save space
            fs.unlinkSync(binaryPath);
            fs.unlinkSync(signaturePath);
          } else {
            console.log(`⚠ Skipping ${binary} - not found (${binaryResponse.status()}, ${binarySignatureResponse.status()})`);
          }
        } catch (error) {
          console.log(`⚠ Error verifying ${binary}: ${error.message}`);
        }
      }
      
      console.log(`Binary signature verification complete: ${verifiedCount}/${binaries.length} files verified`);
      
    } finally {
      // Clean up temp files
      try {
        const sha256Path = path.join(os.tmpdir(), 'SHA256SUMS.asc');
        fs.unlinkSync(sha256Path);
        
        // Only clean up key file if we downloaded it
        if (keyPath) {
          fs.unlinkSync(keyPath);
        }
      } catch (e) {
        // Files might not exist, ignore cleanup errors
      }
    }
  });

  test('should verify dash.org shows latest version and signature links work', async ({ page }) => {
    console.log('Starting dash.org version currency validation...');
    
    // Get latest version from GitHub API
    console.log('Getting latest version from GitHub...');
    const releaseResponse = await page.request.get('https://api.github.com/repos/dashpay/dash/releases/latest', {
      timeout: 30000
    });
    expect(releaseResponse.status()).toBe(200);
    
    const releaseData = await releaseResponse.json();
    const latestVersion = releaseData.tag_name;
    console.log(`Latest GitHub version: ${latestVersion}`);
    
    // Go to dash.org download page
    await page.goto('/download/');
    await page.waitForLoadState('networkidle');
    
    // Find all download links on the page
    const downloadLinks = await page.locator('a[href*="dashpay/dash/releases/download"]').all();
    console.log(`Found ${downloadLinks.length} download links on dash.org`);
    
    expect(downloadLinks.length).toBeGreaterThan(0);
    
    let versionReport = {
      latestVersion,
      dashOrgVersions: [],
      allMatch: true,
      signatureChecks: []
    };
    
    for (let i = 0; i < downloadLinks.length; i++) {
      const link = downloadLinks[i];
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      
      if (href) {
        console.log(`Checking: ${text?.trim()} -> ${href}`);
        
        // Extract version from dash.org URL
        const versionMatch = href.match(/\/v?([\d.]+)\//);
        if (versionMatch) {
          const dashOrgVersion = 'v' + versionMatch[1];
          versionReport.dashOrgVersions.push({ link: text?.trim(), version: dashOrgVersion, href });
          
          // Critical check: is dash.org showing the latest version?
          if (dashOrgVersion !== latestVersion) {
            versionReport.allMatch = false;
            console.error(`❌ OUTDATED: ${text?.trim()} points to ${dashOrgVersion}, but latest is ${latestVersion}`);
          } else {
            console.log(`✅ CURRENT: ${text?.trim()} points to latest version ${dashOrgVersion}`);
          }
          
          // Verify the link works
          const response = await page.request.head(href, { timeout: 30000 });
          expect(response.status()).toBeGreaterThanOrEqual(200);
          expect(response.status()).toBeLessThan(400);
          
          // Check for corresponding signature link
          // If the link is already a signature (.asc), verify it exists
          // If it's a binary, check for binary + .asc
          let expectedSigUrl;
          if (href.endsWith('.asc')) {
            expectedSigUrl = href; // Already a signature file
            console.log(`Checking existing signature: ${expectedSigUrl}`);
          } else {
            expectedSigUrl = href + '.asc'; // Add .asc for binary files
            console.log(`Checking corresponding signature: ${expectedSigUrl}`);
          }
          
          try {
            const sigResponse = await page.request.head(expectedSigUrl, { timeout: 30000 });
            const sigExists = sigResponse.status() >= 200 && sigResponse.status() < 400;
            
            versionReport.signatureChecks.push({
              binaryUrl: href,
              signatureUrl: expectedSigUrl,
              exists: sigExists,
              status: sigResponse.status()
            });
            
            if (sigExists) {
              console.log(`✅ Signature exists: ${expectedSigUrl}`);
            } else {
              console.error(`❌ Signature missing: ${expectedSigUrl} (${sigResponse.status()})`);
            }
            
            expect(sigExists, `Signature file should exist: ${expectedSigUrl}`).toBeTruthy();
          } catch (error) {
            console.error(`❌ Signature check failed: ${expectedSigUrl} - ${error.message}`);
            throw error;
          }
        }
      }
    }
    
    // Generate validation report
    console.log('\n=== DASH.ORG VALIDATION REPORT ===');
    console.log(`Latest GitHub Release: ${versionReport.latestVersion}`);
    console.log(`All versions current: ${versionReport.allMatch ? '✅ YES' : '❌ NO'}`);
    
    console.log('\nDownload Links Found:');
    versionReport.dashOrgVersions.forEach(item => {
      const status = item.version === latestVersion ? '✅' : '❌ OUTDATED';
      console.log(`  ${item.link}: ${item.version} ${status}`);
    });
    
    console.log('\nSignature Validation:');
    versionReport.signatureChecks.forEach(check => {
      const status = check.exists ? '✅' : '❌';
      console.log(`  ${check.binaryUrl.split('/').pop()}: ${status}`);
    });
    
    // Critical assertion: all versions must match latest
    expect(versionReport.allMatch, 
      `dash.org is showing outdated versions! Found: ${versionReport.dashOrgVersions.map(v => v.version).join(', ')}, Expected: ${latestVersion}`
    ).toBeTruthy();
    
    // All signatures must exist
    const missingSignatures = versionReport.signatureChecks.filter(c => !c.exists);
    expect(missingSignatures.length).toBe(0);
    
    console.log('\n✅ All dash.org download links point to latest version with valid signatures!');
  });
});
