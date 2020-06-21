<p align="center">
  <img src="assets/gh-header.svg">
</p>
<p align="center">
    A fast and simple Next.js API framework.
</p>

Strate is a framework for Next.js API routes. It stays out of your way by providing a simple, yet highly customizable 
middleware-based architecture. It features:

- Route specific and global level middleware and configuration
- Automatic middleware order resolution based on their dependencies
- Support for both sync and async routes
- A set of useful middleware out of the box

# How it works

Strate builds upon Next.js file-based routing, and help you keep your code DRY by reusing common logic as middleware on 
your routes. 

You can create simple routes by using Strate's Route function:

```js
import { Route } from "strate"
import Prisma from "./_src/middleware/Prisma" // your custom middleware

export default Route(async (request, response, context) => {
  const users = await context.prisma.user.findMany()
  response.status(200).send(users)
}, {
  middleware: [ new Prisma() ]
})
```

And reuse code by creating a custom Route function with common configuration:

```js
// pages/api/_src/route.js
import { makeRoute, ErrorHandler } from "strate"
import Prisma from "./_src/middleware/Prisma" // your custom middleware

const Route = makeRoute({
  // All routes will have access to these middleware
  middleware: [ 
    new Prisma(),
    new ErrorHandler('E-0000')
  ]
})

export default Route
```

```js
// pages/api/signup.js
import { Validation } from "strate"
import { object, string } from "yup"
import Route from "./_src/route"
 
export default Route(async (request, response, context) => {
  // Data is already validated
  const user = await context.prisma.user.create({ data: request.body })

  response.status(200).send(user)
}, {
  middleware: [
    // This validation middleware is specific to this route
    // It will automatically validate the request body and throw on errors
    new Validation(
      object().shape({
        email: string().email().required(),
        password: string().required()
      })
    )
  ]
})
```

You don't need to worry about middleware ordering. A dependency graph will run all of your middleware in the right order
based on their dependencies.

**This package is still in development!** It is not ready for production yet. Feel free to test it and contribute.



# Documentation
This is a work in progress.

## makeRoute
### one-time middleware

## middleware
### using id() to create new instances

## available middleware