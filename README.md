# Dash Core Download Links Checker

Automated testing for Dash Core download links on dash.org using Playwright.

## Overview

Tests Dash Core download links to ensure they are accessible:

- Dash Core binaries from GitHub releases
- Signature files (.sig, .asc)
- Download page functionality

## Quick Start

### Prerequisites

- Node.js 16+
- npm

### Installation

```bash
git clone <repository-url>
cd dash-org-core-download-check
npm install
npx playwright install chromium
```

### Running Tests

```bash
# Run tests
npm test

# Run with visible browser
npm run test:headed

# Run with Playwright UI
npm run test:ui

# View test report
npm run test:report
```

## Project Structure

```text
dash-org-core-download-check/
├── .github/workflows/test.yml    # CI workflow
├── src/tests/core-download.spec.js # Test suite
├── playwright.config.js          # Configuration
├── package.json                  # Dependencies
└── README.md                     # This file
```

## Tests

- **Download Links**: Validates Dash Core GitHub release links
- **Signature Files**: Checks .sig and .asc file availability  
- **Page Structure**: Verifies download page loads without errors

## GitHub Actions

Runs automatically:

- Daily at 6 AM UTC
- On push/PR to main branch
- Manual trigger available

## Configuration

Local testing uses Chromium only. CI runs all browsers (Chrome, Firefox, Safari).

## Troubleshooting

**Browser not found**: Run `npx playwright install chromium`

**Tests failing**: Run `npm run test:headed` to see browser behavior

**View detailed results**: Run `npm run test:report` after tests complete
