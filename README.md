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

Strate also works on Vercel API routes, since it shares the same features as Next.js' API routes.

# Getting started
Install Strate via npm or yarn:

```
npm install strate
```

...and you're done. The "How it works" section below has some examples to help you get started faster.

# How it works

Strate builds upon Next.js' file-based routing, and help you keep your code DRY by reusing common logic as middleware on 
your routes. 

You can start by creating simple routes using `Route`:

```js
// pages/api/users.js
import { Route } from "strate"
import Prisma from "./_src/middleware/Prisma" // A custom middleware

export default Route(async (request, response, context) => {
  // The context object is where middleware should place useful
  // data (like the Prisma client used below) that routes can use.
  const users = await context.prisma.user.findMany()
  response.status(200).send(users)
}, {
  middleware: [ new Prisma() ]
})
```

Need to share functionality between routes? Reuse code by creating a custom Route function with common configuration:

```js
// pages/api/_src/route.js
import { makeRoute, ErrorHandler } from "strate"
import Prisma from "./_src/middleware/Prisma" // A custom middleware

const Route = makeRoute({
  // All routes will have access to these middleware
  middleware: [ 
    new Prisma(),
    new ErrorHandler('E-0000')
  ],
  // You can also place global configuration here
  debug: true
})

export default Route
```

```js
// pages/api/signup.js
import { Validation } from "strate"
import { object, string } from "yup"
import Route from "./_src/route" // The function created above
 
export default Route(async (request, response, context) => {
  // Data is already validated by the Validation middleware
  const user = await context.prisma.user.create({ data: request.body })

  response.status(200).send(user)
}, {
  middleware: [
    // This validation middleware is specific to this route
    // It will automatically validate the request body and return input errors
    new Validation(
      object().shape({
        email: string().email().required(),
        password: string().required()
      })
    )
  ]
})
```

Finally, Strate middleware are simple classes that must define a "handle()" method:

```js
import { PrismaClient } from "@prisma/client"
import { ErrorHandler } from "strate"

export default class Prisma {
    /**
     * This is optional, but you can use class members to document your middleware.
     * Your IDE will show public class members on your route's context object.
     * When using TypeScript, you don't need to use JSDoc; use types instead.
     *
     * @type {PrismaClient}
     */
    prisma

    // Although our middleware doesn't really uses the ErrorHandler middleware,
    // this is how you define dependencies. Strate automatically resolves them.
    static dependencies = [ ErrorHandler ]

    // This is where you define your middleware code. If you used other
    // middleware-based frameworks before, it should be familiar. You can do
    // whatever you want with the request, response and context objects.
    async handle(request, response, context, next) {
        // This runs before your route code.
        context.prisma = new PrismaClient()

        // Calling "next()" indicates that your middleware is done and the next
        // one in the line can run. After all of them are handled, your route
        // code is finally executed. Take care: "next()" is async, so don't
        // forget to use "await" on it.
        await next()

        // This runs after your route code finishes execution.
        context.prisma.disconnect()
    }
}
```

You don't need to worry about middleware ordering. Dependencies are placed in a dependency graph that resolves the right
order to execute your registered middleware. After your route code is handled, all of your middleware run again in
reverse order (**after** "await next()"), so you have a chance to clean up resources or close database connections, 
for instance.

And that's the gist of it. For advanced use cases, read the documentation below.

**This package is still in development!** It is not ready for production yet. However, Feel free to test it and 
contribute.

# Documentation
You can check the full documentation on the `docs` folder of this repository. Or simply [click here](./docs/readme.md).

## makeRoute
### one-time middleware

## middleware
### using id() to create new instances

## available middleware

# TODO