# Protect: 

Encrypt (multiple) files in-browser, using Balloon hashing to generate a key for AES-GCM.  The results can be downloaded as self-contained HTML files.

Neither the encryption nor the resulting HTML send anything over the network, and can be used offline as local files.  Video/audio/images and text files are displayed in the browser once decrypted, so you don't have to download a copy to view them.

The `Makefile` generates the minified JS and self-contained (single-file) encoder versions.

## Encryption

The balloon hash uses a custom SHA-256 implementation (tested against a reference), rather than the `crypto.subtle` one, because the Promise-based interface of that add a delay to each hash.  The AES encryption is done with `crypto.subtle` though.

The balloon hash makes it slower to brute-force a bunch of passwords

## Why?

Sometimes I want to keep an offline/remote copy of important info (tax/ID stuff, recovery codes, etc.) and it's reassuring to have an extra layer of protection when if it's sitting somewhere less secure (like my Documents folder).

And also because it's fun.

## License & support

[MIT License](LICENSE.txt), [SUPPORT.txt](SUPPORT.txt)
