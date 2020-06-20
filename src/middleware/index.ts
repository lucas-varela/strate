import { NextApiRequest, NextApiResponse } from "next";
import { ContextObject } from "..";


export interface Middleware extends Object{
    namespace?: string
    dependencies?: string[]
    id?(): string
    handle(request: NextApiRequest, response: NextApiResponse, context: ContextObject, next: () => Promise<any>): Promise<any>
}

export { default as ErrorHandler } from './ErrorHandler'
export { default as Validation } from './Validation'