# DyslexiaAway

A simple browser extension that applies the **OpenDyslexic** font to webpages.
For some of us, that small change makes reading a lot easier. ✨

---

## Features

* **Instant toggle:** Turn it on or off with one click
* **Theme switching:** Choose between light, dark, or system themes
* **Custom settings:** Adjust spacing and line height
* **Site exclusion:** Skip pages where it could cause issues
* **Cross-browser compatible:** Works on Chrome, Firefox, and Chromium-based browsers

## Sample

<img src="./app/sample.png" alt="Sample" width="200" style="border-radius: 0.4rem;">

## Installation

### Firefox & Chrome/Chromium Browsers
1. Download the appropriate ZIP file from [Latest Release](https://github.com/ernvk23/dyslexia-away/releases/latest)
   - `dyslexia-away-firefox.zip` for Firefox
   - `dyslexia-away-chrome.zip` for Chrome/Chromium
2. **Firefox:** Go to `about:debugging`, click "This Firefox", then "Load Temporary Add-on" and select the ZIP file
3. **Chrome/Chromium:** Go to `chrome://extensions`, enable "Developer mode", drag and drop the ZIP file
> **Alternative:** If drag & drop doesn't work, extract the ZIP file and use "Load unpacked" in Developer mode.

## Usage
Under extensions, click it to toggle and adjust settings.

## Motivation

I built this because I wanted something simple that just makes reading feel better. 
A lot of accessibility tools are great but try to do too much.
This one only does one thing - and that's enough for me.

If reading has ever felt harder than it should be, this might help.
For me, it made things click in a way they hadn't before.


## Technical Details

- **Manifest Version:** 3 (Chrome & Firefox)
- **Font Loading:** Local font files bundled with extension
- **Storage:** Browser local storage for settings persistence
- **Compatibility:** Chrome 88+, Firefox 109+

## License

Licensed under the [MIT License](./LICENSE).

The OpenDyslexic fonts are licensed under the [SIL Open Font License (OFL)](./app/fonts/OFL.txt).

## Credits

- [OpenDyslexic](https://opendyslexic.org/) - an open typeface made to help with reading (SIL OFL)
- [SVGRepo](https://www.svgrepo.com/) - extension icon (CC0 License)