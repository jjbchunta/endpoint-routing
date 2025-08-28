# A directory-based HTTP request router.

![Version](https://img.shields.io/badge/Version-2.1.2-brightgreen)

The `endpoint-routing` package contains functionality to translate your project directory into the endpoints of your express web server. With support for URL variables, conditional path imports, and mock HTTP calls.

You can install this package via npm:

```
npm install endpoint-routing
```

### Table of Contents

* [Usage](#usage)
* [Structuring your endpoint files](#structuring-your-endpoint-files)
* [Pre-compiling routes](#pre-compiling-routes)
* [Additional features](#additional-features)
    * [URL variables](#url-variables)
    * [Endpoint existance checks](#endpoint-existance-checks)

# Usage

With a dedicated `endpoints` directory...

```
endpoints/
├── get.html (The Homepage)
├── dashboard/
│   ├── get.js
│   └── settings/
│       ├── get.js
│       └── post.js
├── users/
│   └── [userId]/
│       └── get.js
├── login/
│   └── get.html
└── register/
    └── get.html
```

...endpoints become immediately accessable. No middleware needed.

```javascript
import express from 'express'
import initializeRouting from 'endpoint-routing'

const app = express()
initializeRouting(app)

app.getWithRouting()

app.listen(3000)
```

All respective request methods have equivalent `*WithRouting` versions, which handle pointing to the desired endpoint, such as:

* `getWithRouting()`
* `postWithRouting()`
* `putWithRouting()`
* `deleteWithRouting()`
* `patchWithRouting()`
* `useWithRouting()`

# Structuring your endpoint files

The first step is to reserve a folder specifically for the endpoints of your server, with the name of the files in each directory being the HTTP method used to access it's contents, and the file extension being how it's interpreted. An example endpoints directory would look like:

When we're finished setting up your project, the directory path `./endpoints/dashboard/settings/get.js` is translated to `domain.com/dashboard/settings` for your web server.

The file names can be any of the primary HTTP methods, and the supported file extensions are as follows:

* **.js / .mjs / .cjs** JavaScript Files - If a callable function is the default export of the file, it will be invoked with `(req, res)` passed in as parameters, with the third parameter being used for the `next` callback if the callback takes three parameters
* **.html** HTML - Render an HTML file (This requires you to define an engine with Express)

# Pre-compiling routes

With the current implementation, without any pre-computation of our routes, incoming requests directly traverse the `endpoints` folder to see if a route is valid. Of which, you don't need me to tell you that is hardly efficient.

A call to `buildEndpointRoutes` will construct a registry of all the exposed endpoints incoming requests can utilize.

```javascript
import { buildEndpointRoutes } from 'endpoint-routing'

const args = {
    // The relative path to the file where the compiled routes should be written to
    output: 'routes.json',
    // The parent folder we're compiling these endpoints from
    endpoints: 'endpoints',
    // Endpoint paths to exclude
    pathBlacklist: ['dev'],
    // Log status updates
    debug: true,
}
await buildEndpointRoutes(args)
```

In this example, this is a lone file that can be manually ran with the `node` command. Or if you're using Docker, you can hook it to run on `scripts.deploy` inside of your project's `package.json` to generate on deployment.

> [!NOTE]
> This points to the endpoint files instead of storing a copy of the functions, so updates to the callback don't require a re-compile of the routes.

### Now, you're all set up to preform a(n efficient) request!

```javascript
import express from 'express'
import initializeRouting from 'endpoint-routing'

const app = express()
initializeRouting(app, 'routes.json') // Linked pre-compiled routes

app.getWithRouting()

app.listen(3000)
```

# Additional features

### URL variables

When defining the endpoint paths in your project files, you can wrap pathnames with square brackets to indicate variables, similar to that of `/:variable` in traditional middleware.

```
endpoints/
└── users/
    └── [userId]/
        └── index.js
```

The value within the URL will be injected into the Express-provided request object under the `params` key. For example, a request to this:

```
/users/4124
```

Will translate into this under `req.params`:

```javascript
{ userId: "4124" }
```

### Endpoint existance checks

Optionally, you can check that the endpoint at the requested path and method exists before continuing in your middleware.

``` javascript
app.use(async (req, res, next) => {
    const doesEndpointExist = await app.doesEndpointExist(req.path, req.method)
    if (!doesEndpointExist) {
        req.status(404).json({error: "Route not found."})
        return
    }
    next()
})
```