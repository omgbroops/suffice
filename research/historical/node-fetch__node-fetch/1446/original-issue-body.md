node-fetch: 3.1.0
nodejs: 17.3.0

Memory working set is grows and not freed:
```js
import fetch from "node-fetch";
import http from "http";

const agent = new http.Agent( {
    "keepAlive": true,
    // keepAliveMsecs: 5000,
} );

var i = 0;

while ( 1 ) {

    const res = await fetch("http://example.com", { agent });
    await res.text();

    console.log( ++i, res.status );
}
```

For pure node http everything is ok:
```js
import http from "http";

const agent = new http.Agent( {
    "keepAlive": true,
    // keepAliveMsecs: 5000,
} );

var i = 0;

while ( 1 ) {
    const res = await new Promise( resolve => {
        http.get( "http://example.com/", { agent }, res => {
            res.on( "data", chunk => {} );

            res.on( "end", () => {
                resolve( { "status": res.statusCode } );
            } );
        } );
    } );

    console.log( ++i, res.status );
}
```