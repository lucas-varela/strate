import { Middleware } from "./index";
import { NextApiRequest, NextApiResponse } from "next";
import { ContextObject } from "..";


type ErrorResponder = (
    code?: string,
    message?: string,
    statusCode?: number,
    additionalProps?: { [key: string]: any }
) => void

class HandledError extends Error {
}


export default class ErrorHandler implements Middleware {
    public error: ErrorResponder

    constructor(
        private readonly defaultCode = 'ERR-0000',
        private readonly defaultMessage = 'An unspecified error occurred.',
        private readonly defaultStatusCode = 500
    ) {
    }

    static namespace = 'Strate'

    async handle(request: NextApiRequest, response: NextApiResponse, context: ContextObject, next: () => Promise<any>): Promise<any> {
        const error: ErrorResponder = (
            code = this.defaultCode,
            message = this.defaultMessage,
            statusCode = this.defaultStatusCode,
            additionalProps = {}
        ) => {
            response.status(statusCode).send({ error: { code, message, ...additionalProps } })

            throw new HandledError()
        }

        context.error = error

        try {
            await next()
        } catch (err) {
            if (err instanceof HandledError) {
                // This error was already handled and the response
                // was already sent, finish execution.
                return
            } else if (process.env.NODE_ENV === 'production') {
                // Suppress unhandled errors on production
                error()
            } else {
                context.strate.warn('An error was thrown:')

                throw err
            }
        }
    }
}