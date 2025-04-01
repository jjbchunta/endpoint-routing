# endpoint-routing

![Version](https://img.shields.io/badge/Version-1.0.3-brightgreen)

A directory-based HTTP request router.

The `endpoint-routing` package contains functionality to translate the project directory into the endpoints of your web server, with support for URL variables, conditional path imports, and mock HTTP calls.

Example project endpoint directory structure:

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

# Usage

### Defining endpoint functions -

This is the expected format of an `index.js` file contained within an endpoint directory.

```javascript
/*
export default {
    [METHOD]: (req, res) => {
        // ... your endpoint function code ...
    }
};
*/

export default {
    GET: (req, res) => {
        // Example GET method endpoint:
        // In this example, nothing is passed back to express middleware
        // and the request is handled internally.
        res.status(200).send(`<h1>Success</h1>`);
        return 0;
    },
    POST: (req, res) => {
        // Example POST method endpoint:
        // In this example, data is passed back to the express middleware
        // calling this endpoint for further processing. Useful for chaining
        // endpoint calls together.
        return { message: "Success" }
    }
};
```

All supported HTTP methods can be included, all with their respective function definitions. Any exceptions that are thrown or data that is returned by these functions will be routed back to be dealt by the `simulatePathRequest` function caller.

### Compiling the endpoint routes -

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

In this example, this is a lone file that can be manually ran with the `node` command, or you can hook it to run on `scripts.deploy` inside of your project's `package.json` if you're using Docker.

**Note** - This points to the endpoint files instead of storing a copy of the functions, so updates to the endpoints don't require a re-compile of the routes.

### Preforming a request to an endpoint -

An example middleware flow of checking to ensure that the request path actually exists, before actually preforming the function at said path.

```javascript
import express from 'express';
import endpointRouting from 'endpoint-routing';

// Initializing Express
const app = express();

// Initializing the endpoint router
const routing = endpointRouting({
    routesConfig: 'routes.json', // The compiled routes JSON file
    handlersDir: 'endpoints', // The endpoint directory
    allowedMethods: ['GET', 'POST'] // HTTP method whitelist
});

// (Optional) Check if the endpoint path exists.
app.use((req, res, next) => {
    const doesEndpointExist = await routing.doesEndpointExist(req.path, req.method);
    if (!doesEndpointExist) {
        req.status(404).json({error: "Route not found."});
        return;
    }
    next();
});

// ... additional middleware ...

// Preform the request.
app.use(async (req, res, next) => {
    const path = req.path;
    const method = req.method;
    const result = await routing.simulatePathRequest(path, method, req, res);
    // Additional processing ...
});
```

**Note** - If either the `configOutput` / `routesConfig` or the `handlersDir` is left blank, "routes.json" and "endpoints" respectively will be the assumed values.

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