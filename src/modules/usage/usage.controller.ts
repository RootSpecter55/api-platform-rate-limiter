import type { Request, Response } from 'express';
import { currentClient } from '../../common/auth-middleware';
import { sendPage } from '../../common/response';
import type { ApiKeyUsageParams, UsageQuery } from './usage.schemas';
import type { UsageService } from './usage.service';

export class UsageController {
  constructor(private readonly service: UsageService) {}

  /** The calling client's own usage. */
  mine = async (req: Request, res: Response) => {
    const query = req.validated.query as UsageQuery;
    sendPage(res, await this.service.list(currentClient(req).id, query));
  };

  /** Admin: any key's usage. */
  forKey = async (req: Request, res: Response) => {
    const { id } = req.validated.params as ApiKeyUsageParams;
    sendPage(res, await this.service.listForKey(id, req.validated.query as UsageQuery));
  };
}
