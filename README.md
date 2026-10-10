# Shop Studio 2 — Clean Project

## Website
Deploy the files in this directory to GitHub Pages. Keep all versioned `app-v*.js` files: `index.html` loads them directly.

## Windows 10 document scanner
Supported scanner-capable devices: Canon G3010, Brother DCP-L2541DW, Brother DCP-L2520D. Epson L8050 is a printer only.

1. Install each scanner's Windows driver and verify scanning in Windows or NAPS2.
2. In `windows-scanner-bridge`, run `INSTALL-BRIDGE.cmd` as administrator (once).
3. Verify `http://127.0.0.1:17899/health` and `http://127.0.0.1:17899/scanners`.
4. Use the DOCUMENT SCANNER section. If needed, run `OPEN-LOCAL-SCANNER.bat` to launch the local app.

The bridge is local to your PC and must be running for scanning.

## Cleanup
Removed obsolete Python bridge/server alternatives, duplicate bridge backup, redundant launcher and historical setup notes. Retained active frontend modules, service worker, and bridge install/start/uninstall scripts. Hardware functionality must be verified on Windows 10.
