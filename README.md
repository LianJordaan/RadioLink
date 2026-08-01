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
2. Select **Choose radio** and pick the nearby `RadioLink` device.
3. The dashboard and nearby Wi-Fi networks load automatically.
4. Enter the Wi-Fi password and select **Save and connect**.

The password is sent directly from the browser to the radio over BLE. It is not
sent to GitHub Pages and is not stored by this site.

## Advanced settings

The **Advanced settings** section shows ten fixed physical dial positions. Every card
shows its BCM GPIO number and Raspberry Pi physical header-pin number. Users can edit
the character ID and stream URL, but cannot add positions, remove positions, or alter
the wiring map. Blank IDs represent unused dial positions. Non-empty IDs must be
unique, including uppercase/lowercase differences.

**Reset character IDs** restores `SFM`, `OFM`, `RSG`, `ALGUA`, and `LEK` on the
first five positions and clears the remaining five IDs while preserving the first
five stream links. **Factory reset everything** restores the IDs, original links,
empty positions, and default device character code. Factory reset deliberately preserves saved Wi-Fi networks.
Configuration changes are validated before saving and are rolled back if an affected
radio service cannot restart cleanly.

The bottom of **Advanced settings** edits the device character code used in the
Bluetooth name, such as `Radio-tester12`. It is an identifier, not a password:
selecting the radio opens its dashboard automatically. Saving a new code reloads the
page and requires selecting the newly named radio again.

Opening Advanced settings shows a percentage and progress bar while the fixed dial
positions are read over Bluetooth. Each position normally loads in one request;
unusually long entries automatically fall back to a two-part transfer.

If saved Wi-Fi is unavailable, the radio creates an open `Radio-Setup` hotspot. Its
local gateway page closes the temporary hotspot, lets the phone return to its normal
internet connection, and redirects to `https://radio.jorda.co.za/`. Wi-Fi details are
then configured over Bluetooth from the published RadioLink page.

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
