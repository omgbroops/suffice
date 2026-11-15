# Third-party notices

Browser automation uses Vercel Labs `agent-browser` 0.43.0 (https://github.com/vercel-labs/agent-browser). Native desktop automation uses Vercel Labs `agent-desktop` 1.3.1 (https://github.com/vercel-labs/agent-desktop). Both are Apache-2.0 licensed; their npm distributions retain their license and notice files. Chrome for Testing is downloaded separately by the setup command and retains its own terms. Neither automation backend contributes an additional reasoning model.

The optional Rust traversal addon includes locked Cargo dependencies. Their upstream license texts are retained in `native/THIRD-PARTY-LICENSES.txt` when the addon is built; runtime and build-time package versions are recorded in the Cargo locks. The Rust standard library and target system libraries remain part of the native runtime boundary.

Suffice uses the unmodified `@earendil-works/pi-coding-agent` 1.5.2 agent engine and its dependencies. Pi is a separate project, created by Mario Zechner: https://github.com/earendil-works/pi

Pi is MIT licensed. Its license notice follows (source: https://github.com/earendil-works/pi/blob/main/LICENSE). Other dependencies retain their own package licenses; npm installs those dependencies separately.

```text
MIT License

Copyright (c) 2025 Mario Zechner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
