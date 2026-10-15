```js
const fetch = require('node-fetch');
const http = require('http');

const server = http.createServer((request, response) => {
        response.setHeader('content-encoding', 'deflate'); // change this to gzip and it works
        response.end();
});

server.listen(8080);

(async () => {
        const response = await fetch('http://localhost:8080');
        const text = await response.text();

        console.log('Result:', text);

        server.close();
})();
```

Looks like you're missing

```diff
+				let hasData = false;
				raw.once('data', chunk => {
+					hasData = true;
					// See http://stackoverflow.com/questions/37519828
					body = (chunk[0] & 0x0F) === 0x08 ? pump(body, zlib.createInflate(), reject) : pump(body, zlib.createInflateRaw(), reject);

					response = new Response(body, responseOptions);
					resolve(response);
				});
+
+				raw.once('end', () => {
+					if (!hasData) {
+						response = new Response(body, responseOptions);
+						resolve(response);
+					}
+				});
```

before https://github.com/node-fetch/node-fetch/blob/41f53b9065a00bc73d24215d42aacdcd284b199c/src/index.js#L292