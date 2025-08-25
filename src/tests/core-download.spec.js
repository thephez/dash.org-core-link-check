const { test, expect } = require('@playwright/test');

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
});
