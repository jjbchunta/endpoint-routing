# A directory-based HTTP request router.

![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen)

The `endpoint-routing` package contains functionality to translate your project directory into the endpoints of your express web server. With support for URL variables, conditional path imports, and mock HTTP calls.

You can install this package via npm:

```
npm install endpoint-routing
```

# Usage

### Structuring your project

You begin by desginating a folder in your project to defining the endpoints that will be exposed by your web server, where the path up to the `index.js` file is the URL path.

```
endpoints/
├── index.js
├── dashboard/
│   ├── index.js
│   ╰── settings/
│       ╰── index.js
├── users/
│   ╰── [userId]/
│       ╰── index.js
├── login/
│   ╰── index.js
╰── register/
    ╰── index.js
```

When we're finished setting up your project, the directory path `./endpoints/dashboard/settings/index.js` is translated to `domain.com/dashboard/settings` for your web server.

### Defining endpoint functions

Inside of every `index.js` file that suffixes any directory path, the middleware callback exists as a key / value relationship inside of `export default`.

The HTTP request method (in all caps) is the key, with the anonymous function as the value which you would format like you would any other middleware function.

```javascript
export default {
    // Example GET method endpoint:
    GET: (req, res, next) => {
        res.status(200).send(`<h1>Success</h1>`);
        next();
    }
};
```

### Compiling the endpoint routes

A call to `buildEndpointRoutes` will construct an optimized index of all the exposed endpoints incoming requests can utilize.

In this example, this is a lone file that can be manually ran with the `node` command. Or if you're using Docker, you can hook it to run on `scripts.deploy` inside of your project's `package.json` to generate on deployment.

```javascript
import { buildEndpointRoutes } from 'endpoint-routing';

(async () => {
    // Compile the endpoint routes.
    const args = {
        configOutput: 'routes.json', // The name of the file where the compiled routes should be written to
        handlersDir: 'endpoints', // The parent folder we're compiling these endpoints from
        pathBlacklist: ['dev'], // Endpoint paths to exclude
        debug: true, // Log status updates
    };
    await buildEndpointRoutes(args);
})();
```

> [!NOTE]
> This points to the endpoint files instead of storing a copy of the functions, so updates to the callback don't require a re-compile of the routes.

### Now, you're all set up to preform a request!

```javascript
import express from 'express';
import initializeRouting from 'endpoint-routing';

const app = express();
initializeRouting(app, 'routes.json');

app.getWithRouting();
```

All respective request methods have equivalent `*WithRouting` versions, which handle pointing to the desired endpoint, such as:

* `getWithRouting();`
* `postWithRouting();`
* `putWithRouting();`
* `deleteWithRouting();`

Optionally, you can check that the endpoint at that path and request method exists before continuing.

``` javascript
app.use(async (req, res, next) => {
    const doesEndpointExist = await app.doesEndpointExist(req.path, req.method);
    if (!doesEndpointExist) {
        req.status(404).json({error: "Route not found."});
        return;
    }
    next();
});
```

# Additional Features

### URL Variables -

When defining the endpoint paths in your project files, you can wrap pathnames with square brackets to indicate variables, similar to that of `/:variable` in traditional middleware.

```
endpoints/
╰── users/
    ╰── [userId]/
        ╰── index.js
```

The value within the URL will be injected into the Express-provided request object under the `params` key. For example, a request to this:

```
/users/4124
```

Will translate into this under `req.params`:

```javascript
{ userId: "4124" }
```