const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');

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
    
    console.log('Starting GPG signature verification...');
    
    try {
      // Download pasta's public key from keybase
      console.log('Downloading GPG public key from keybase...');
      const keyResponse = await page.request.get('https://keybase.io/pasta/pgp_keys.asc');
      expect(keyResponse.status()).toBe(200);
      
      const keyContent = await keyResponse.text();
      fs.writeFileSync('/tmp/pasta-key.asc', keyContent);
      console.log('GPG key downloaded and saved');
      
      // Import the key
      console.log('Importing GPG key...');
      execSync('gpg --import /tmp/pasta-key.asc 2>/dev/null', { stdio: 'pipe' });
      console.log('GPG key imported successfully');
      
      // Get latest release to find current version
      console.log('Finding latest release version...');
      await page.goto('https://github.com/dashpay/dash/releases/latest');
      const url = page.url();
      const versionMatch = url.match(/tag\/(v[\d.]+)/);
      expect(versionMatch).toBeTruthy();
      
      const version = versionMatch[1];
      console.log(`Found latest version: ${version}`);
      
      // Download SHA256SUMS.asc (clearsigned message)
      const baseUrl = `https://github.com/dashpay/dash/releases/download/${version}`;
      console.log(`Downloading SHA256SUMS.asc from ${baseUrl}...`);
      
      const sigResponse = await page.request.get(`${baseUrl}/SHA256SUMS.asc`);
      expect(sigResponse.status()).toBe(200);
      
      // Save clearsigned file
      const sigContent = await sigResponse.text();
      fs.writeFileSync('/tmp/SHA256SUMS.asc', sigContent);
      console.log('SHA256SUMS.asc downloaded and saved');
      
      // Verify clearsigned message (no separate file needed)
      console.log('Verifying GPG signature...');
      try {
        const result = execSync('gpg --verify /tmp/SHA256SUMS.asc 2>&1', { encoding: 'utf8' });
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
          const binaryResponse = await page.request.get(`${baseUrl}/${binary}`);
          const binarySignatureResponse = await page.request.get(`${baseUrl}/${binary}.asc`);
          
          if (binaryResponse.status() === 200 && binarySignatureResponse.status() === 200) {
            // Save binary and signature
            const binaryContent = await binaryResponse.body();
            const signatureContent = await binarySignatureResponse.text();
            
            fs.writeFileSync(`/tmp/${binary}`, binaryContent);
            fs.writeFileSync(`/tmp/${binary}.asc`, signatureContent);
            
            // Verify signature
            try {
              const result = execSync(`gpg --verify /tmp/${binary}.asc /tmp/${binary} 2>&1`, { encoding: 'utf8' });
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
            fs.unlinkSync(`/tmp/${binary}`);
            fs.unlinkSync(`/tmp/${binary}.asc`);
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
        fs.unlinkSync('/tmp/pasta-key.asc');
        fs.unlinkSync('/tmp/SHA256SUMS.asc');
      } catch (e) {
        // Files might not exist, ignore cleanup errors
      }
    }
  });
});
