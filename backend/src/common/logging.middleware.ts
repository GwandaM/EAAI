import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    private readonly logger = new Logger("HTTP");

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl, ip } = req;
        const start = Date.now();

        res.on("finish", () => {
            const duration = Date.now() - start;
            const { statusCode } = res;
            this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`);
        });

        next();
    }
}
