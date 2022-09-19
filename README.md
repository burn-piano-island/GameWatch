### GameWatch

This is a Node.js client application to sync NHL game events with a Hue Sync-enabled Entertainment Area.

This is a work in progress and is anything *but* stable.

## Initial setup
Currently, you'll need to make a `.env` file in the root directory with the following variables:
- `NODE_TLS_REJECT_UNAUTHORIZED=0` - this disables HTTPS / certificate validation checks when interacting with the Hue Bridge on the local network.
- `DEBUG=true` - enable / disable this setting to test functionality and see some additional debug output.
- `hueBridgeIP` - If you already know the IP address of the Hue bridge you want to use, enter it here. Otherwise the application will attempt to discover it.

## Bridge authentication
Once you've successfully connected / authenticated to a bridge, the application will write the following values to the previously mentioned `.env` file:
- `hueBridgeIP` - selected bridge address
- `hueclientkey` - client id key (generated during auth)
- `hueapplicationkey`- client application key used for authenticated calls against the hub (generated during auth).

If you want to reset your hue bridge settings, just remove these values from `.env` and run the application again.