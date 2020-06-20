import { Middleware } from "../middleware";


export type Type<T> = new (...args: any[]) => T;

export type StrateConfiguration<M = Middleware> = {
    debug?: boolean
    middleware?: M[]
    skip?: (string | Type<Middleware>)[]
}

const DefaultConfiguration: StrateConfiguration =  {
    debug: false,
}

export default DefaultConfiguration