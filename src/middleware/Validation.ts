import { Schema, ValidationError } from "yup";
import { NextApiRequest, NextApiResponse } from "next";
import { ErrorHandler, Middleware } from "./index";
import { ContextObject } from "..";

export default class Validation implements Middleware {
    private readonly schema: Schema<any>

    constructor(schema: Schema<any>) {
        this.schema = schema
    }

    static namespace = 'Strate'

    static dependencies = [ ErrorHandler ]

    async handle(request: NextApiRequest, response: NextApiResponse, { error }: ContextObject, next: () => Promise<any>): Promise<any> {
        try {
            await this.schema.validate(request.body || {}, { abortEarly: false, stripUnknown: true })
        } catch (e) {
            if (e instanceof ValidationError) {
                error(
                    'V-KI-0000',
                    'There were validation errors on your request.',
                    422,
                    { errors: e.errors }
                )
            }
        }

        await next()
    }
}