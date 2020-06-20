import { NextApiRequest, NextApiResponse } from "next"
import { Middleware } from "../middleware"
import { DepGraph } from 'dependency-graph'
import { default as defaultConfiguration, StrateConfiguration } from "../configuration/default"
import chalk from "chalk"


type NextApiHandler = (request: NextApiRequest, response: NextApiResponse) => any

type LoggerFunction = (message: any) => void

export type ContextObject = {
    [key: string]: any
    /**
     * This is where Strate places its configurations and
     * helpful logging helpers.
     */
    strate: {
        configuration: StrateConfiguration
        /**
         * Logs a message on the console with a "warning" tag.
         * @param message - A message to log. Non-string values will be coerced to String.
         */
        warn: LoggerFunction
        /**
         * Logs a message on the console with a "debug" tag.
         * @param message - A message to log. Non-string values will be coerced to String.
         */
        debug: LoggerFunction
    }
}

type GetKeys<U> = U extends Record<infer K, any> ? K : never

type UnionToIntersection<U extends object> = {
    [K in GetKeys<U>]: U extends Record<K, infer T> ? T : never
}

export type RouteHandler<M extends Middleware = Middleware, C extends Middleware = Middleware> = (
    request: NextApiRequest,
    response: NextApiResponse,
    context: ContextObject
        & Omit<UnionToIntersection<M>, keyof Middleware>
        & Omit<UnionToIntersection<C>, keyof Middleware>
) => Promise<void>

type ConsoleHelper = (message: string) => void


/**
 * Resolves the name of the given Middleware. Prepends its name with a namespace, if available.
 */
function getMiddlewareName(middleware: any) {
    if (typeof middleware === 'string') {
        // String given, simply return it
        return middleware
    } else if (typeof middleware === 'function') {
        // Middleware is hopefully a class function
        return middleware.namespace ? `${middleware.namespace}.${middleware.name}` : middleware.name
    } else if (typeof middleware === 'object') {
        // Middleware is hopefully a class instance
        let namespace: string

        // If a namespace is set, it is prepended to the middleware name
        if (middleware.constructor.namespace) namespace = middleware.constructor.namespace + '.'

        const id = middleware.id && typeof middleware.id === 'function' && middleware.id()

        // async
        if (id instanceof Promise) {
            throw new Error(`The "id()" method of the ${middleware.constructor.name} middleware class must not be \
async. It should return a string.`)
        }

        // If the middleware has an id() method, it takes precedence over its class name
        return namespace + (id || middleware.constructor.name)
    }
}

/**
 * Creates a context object which warns users about property reassignment.
 */
function createContext(configuration: object, debug: ConsoleHelper, warn: ConsoleHelper): ContextObject {
    const context = {
        strate: { configuration, warn, debug }
    }

    return new Proxy(context, {
        set(target: {}, property: PropertyKey, value: any, receiver: any): boolean {
            if (target.hasOwnProperty(property)) {
                warn(`Strate context property "${String(property)}" is being reassigned by the route or the current \
middleware. If you meant to do this, ignore this warning.`)
            }

            return Reflect.set(target, property, value, receiver)
        },
        get(target: {}, property: PropertyKey, receiver: any): any {
            if (!target.hasOwnProperty(property)) {
                warn(`Property "${String(property)}" was not found on the context object. Did you forget do add a \
middleware that provide this property?`)
            }

            return Reflect.get(target, property, receiver)
        }
    }) as ContextObject
}

/**
 * Loads and merge default, project and route configuration objects.
 */
async function loadConfiguration(
    { middleware: baseMiddleware = [], ...baseConfiguration }: StrateConfiguration,
    { middleware: routeMiddleware = [], skip = [], ...routeConfiguration }: StrateConfiguration,
): Promise<StrateConfiguration> {
    // Resolve middleware instances to string IDs
    const resolvedSkip = skip.map((middleware) => {
        return getMiddlewareName(middleware)
    })

    return Object.assign(baseConfiguration, routeConfiguration, {
        middleware: []
            .concat(baseMiddleware, routeMiddleware)
            // Remove skipped middleware from the list
            .filter(middleware => !resolvedSkip.includes(getMiddlewareName(middleware))),
        skip: resolvedSkip
    })
}

/**
 * Creates logger functions that will be injected into the context.
 */
function createLoggers(configuration: StrateConfiguration): [ ConsoleHelper, ConsoleHelper ] {
    const debug: LoggerFunction = (message: string) => {
        if (configuration.debug) {
            // tslint:disable-next-line:no-console
            console.debug(`[ Strate - ${chalk.cyan('debug')} ] ${String(message)}`)
        }
    }

    const warn: LoggerFunction = (message: string) => {
        if (configuration.debug) {
            // tslint:disable-next-line:no-console
            console.debug(`[ Strate - ${chalk.yellow('warning')} ] ${String(message)}`)
        }
    }

    return [ debug, warn ]
}

function addMiddlewareToGraph(graph: DepGraph<Middleware>, context: ContextObject, middleware: Middleware[] = []) {
    for (const instance of middleware) {
        const instanceName = getMiddlewareName(instance)

        if (graph.hasNode(instanceName)) {
            const intendedSolution =
                context.strate.configuration.skip && context.strate.configuration.skip.length
                    ? `add "${instanceName}" to the "skip" array on this route configuration`
                    : `add "skip: [ '${instanceName}' ]" to this route configuration`

            const duplicateIdSolution =
                instance.id && typeof instance.id === 'function'
                    ? 'modify their class\' "id()" method to return unique strings'
                    : 'create an "id()" method on the middleware class that returns unique strings'

            context.strate.warn(
                `The "${instanceName}" middleware was used more than once. Only the last instance of the middleware \
will be used. If this was intended, ${intendedSolution} to suppress this message. If you intended to use both \
(or more) middleware instances, ${duplicateIdSolution} to identify different instances.`
            )

            graph.setNodeData(instanceName, instance)
        } else {
            graph.addNode(instanceName, instance)
        }
    }
}

/**
 * Returns a dependency graph and the order which the given middleware needs to be executed.
 */
function resolveMiddleware(context: ContextObject): [ DepGraph<Middleware>, string[] ] {
    // Create a new dependency graph.
    const graph = new DepGraph() as DepGraph<Middleware>

    addMiddlewareToGraph(graph, context, context.strate.configuration.middleware)

    // Set middleware dependencies
    for (const instance of context.strate.configuration.middleware as any) {
        const instanceName = getMiddlewareName(instance)

        if (instance.constructor.dependencies && instance.constructor.dependencies.length) {
            for (const dependency of instance.constructor.dependencies) {
                const dependencyName = getMiddlewareName(dependency)

                try {
                    graph.addDependency(instanceName, dependencyName)
                } catch (e) {
                    if (
                        context.strate.configuration.skip
                        && context.strate.configuration.skip.includes(dependencyName)
                    ) {
                        throw new Error(`Middleware "${instanceName}" depends on a skipped middleware: \
${dependencyName}. Either remove "${dependencyName}" from the "skip" array on your configuration, or remove \
"${instanceName}" from your "middleware" array.`)
                    } else {
                        throw new Error(`Middleware "${instanceName}" depends on a missing middleware: \
${dependencyName}`)
                    }


                }
            }
        }
    }

    return [ graph, graph.overallOrder() ]
}

/**
 * Generates a middleware dependency graph, handle it, and finally handle the requested route.
 */
async function executeRoute<M extends Middleware>(
    request: NextApiRequest,
    response: NextApiResponse,
    context: ContextObject,
    handler: RouteHandler<M>
): Promise<void> {
    context.strate.debug('Generating middleware graph')

    // A dependency graph resolves the right order to run the middleware.
    const [ graph, middlewareArray ] = resolveMiddleware(context)

    context.strate.debug('Running middleware in the following order: ' + middlewareArray.join(' -> '))

    // Warn the user about skipped middleware
    if (context.strate.configuration.skip && context.strate.configuration.skip.length) {
        context.strate.debug('The following middleware were skipped: ' + context.strate.configuration.skip.join(', '))
    }

    // Check used to warn the developer in case a middleware responds early to the request.
    let handlerHasBeenExecuted = false

    // This is where middleware are actually handled. Each middleware runs
    // in the order resolved by the dependency graph. After all middleware
    // are handled, the route function handler is finally executed, and
    // all the middleware finishes handling their code in reverse order.
    async function next(index = 0) {
        if (middlewareArray[index]) {
            const middlewareInstance = graph.getNodeData(middlewareArray[index])
            const middlewareName = getMiddlewareName(middlewareInstance)

            context.strate.debug(`Running: ${middlewareName}`)

            await middlewareInstance.handle(request, response, context, () => next(index + 1))
        } else {
            context.strate.debug(`Running route handler`)

            handlerHasBeenExecuted = true

            // @ts-ignore
            await handler(request, response, context)
        }
    }

    // Start by running the first middleware.
    await next()

    // Warn the user about early responses.
    if (handlerHasBeenExecuted) {
        context.strate.debug('Strate finished execution successfully.')
    } else {
        context.strate.warn('Strate finished execution successfully, but the called route handler wasn\'t' +
            ' executed. A middleware may have sent a response before the handler had a chance to run.')
    }
}

export function makeRoute<C extends Middleware>(baseConfiguration: StrateConfiguration<C> | Function) {
    return <M extends Middleware>(
        handler: RouteHandler<M, C>,
        routeConfiguration: StrateConfiguration<M>
    ): NextApiHandler => {
        return async (request: NextApiRequest, response: NextApiResponse) => {
            // Merge base and route configurations.
            // If baseConfiguration is a function, the default configuration is used.
            const configuration = await loadConfiguration(
                typeof baseConfiguration === 'function' ? defaultConfiguration : baseConfiguration,
                routeConfiguration
            )

            // Console logging helpers are created.
            const [ debug, warn ] = createLoggers(configuration)

            debug(`Route: ${request.method} ${request.url}`)

            // The context object is where middleware should place functions, variables and
            // helpful object instances which can in turn be used by the route. We also save
            // configuration and logging helpers in there.
            const context = createContext(configuration, debug, warn)

            // The user may use makeRoute to create a simple, one-time middleware. This is
            // possible by supplying makeRoute with a function instead of a configuration
            // object. If this is the case, run the given function and provide it access to
            // the request, response and context objects before running the route handler.
            if (typeof baseConfiguration === 'function') {
                await baseConfiguration(request, response, context)
            }

            // Finally, bootstrap the middleware and run the route handler.
            await executeRoute(request, response, context, handler)
        }
    }
}

export default function Route<M extends Middleware>(
    handler: RouteHandler<M>,
    routeConfiguration: StrateConfiguration<M>
): NextApiHandler {
    return async (request: NextApiRequest, response: NextApiResponse) => {
        // The state.config.js file or the default configuration is read and returned.
        const configuration = await loadConfiguration(defaultConfiguration, routeConfiguration)

        // Console logging helpers are created.
        const [ debug, warn ] = createLoggers(configuration)

        debug(`Route: ${request.method} ${request.url}`)

        // The context object is where middleware should place functions, variables and
        // helpful object instances which can in turn be used by the route. We also save
        // configuration and logging helpers in there.
        const context = createContext(configuration, debug, warn)

        await executeRoute(request, response, context, handler)
    }
}