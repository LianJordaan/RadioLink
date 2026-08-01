# RadioLink

RadioLink is a static GitHub Pages interface for configuring the Raspberry Pi
internet radio directly over Bluetooth Low Energy. No application install or web
server on the radio is required.

## Suggested repository name

`radio-link`

## Publish with GitHub Pages

1. Create a repository named `radio-link`.
2. Copy the contents of this folder into the repository root.
3. Commit and push to the `main` branch.
4. Open **Settings → Pages** in GitHub.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select `main`, `/ (root)`, and save.
7. Open the HTTPS address shown by GitHub Pages.

Web Bluetooth requires HTTPS and a user click before the browser can display its
Bluetooth device chooser. Use Chrome on Android, Windows, macOS, or ChromeOS.
Brave disables Web Bluetooth, and iPhone/iPad browsers do not support it.

After its first successful load, the service worker caches the page so it can open
without internet access later.

## Using it

1. Switch Bluetooth on and open the published page.
2. Select **Choose radio** and pick the nearby `Radio-XXXXXXXX` device.
3. The page fills the eight-character code from that Bluetooth name automatically.
   The same code is also the fallback-hotspot password.
4. Scan for Wi-Fi, enter the password, and select **Save and connect**.

The password is sent directly from the browser to the radio over BLE. It is not
sent to GitHub Pages and is not stored by this site.

## Advanced settings

The **Advanced settings** section can read, edit, and reset all five station stream
URLs. Saving or resetting the links restarts `radio.service` so playback immediately
uses the selected values.

The nested **Super advanced settings** section controls the eight-character access
code and BCM GPIO map. Changes restart the affected services. Reset restores this
radio's original access code (`ewrd5qyw`) and GPIO values (`17, 27, 22, 5, 6`).

## If Bluetooth permission is blocked

On the published page, tap the site-information icon beside the Chrome address,
open **Permissions**, and choose **Reset permissions**. Reload the page and select
**Choose radio** again.

On Android, also open **Settings → Apps → Chrome → Permissions** and allow
**Nearby devices**. Brave disables Web Bluetooth, and Chrome on iPhone and iPad
does not support it.

## BLE protocol

- Service UUID: `42f00001-9b5f-4f6e-9f19-6f4b7c9a4e10`
- Command characteristic: `42f00002-9b5f-4f6e-9f19-6f4b7c9a4e10`
- Response characteristic: `42f00003-9b5f-4f6e-9f19-6f4b7c9a4e10`

Commands are UTF-8 JSON split into BLE-safe 20-byte frames. The first byte is
`0x01` for start, `0x02` for continuation, or `0x03` for end. Responses are JSON
read from the response characteristic.
