import type { Request, Response } from 'express';
import { sendData, sendPage } from '../../common/response';
import type { CreateTierInput, ListTiersQuery, TierParams, UpdateTierInput } from './tiers.schemas';
import type { TiersService } from './tiers.service';

export class TiersController {
  constructor(private readonly service: TiersService) {}

  list = async (req: Request, res: Response) => {
    sendPage(res, await this.service.list(req.validated.query as ListTiersQuery));
  };

  get = async (req: Request, res: Response) => {
    sendData(res, await this.service.get((req.validated.params as TierParams).id));
  };

  create = async (req: Request, res: Response) => {
    sendData(res, await this.service.create(req.validated.body as CreateTierInput), 201);
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.validated.params as TierParams;
    sendData(res, await this.service.update(id, req.validated.body as UpdateTierInput));
  };

  delete = async (req: Request, res: Response) => {
    await this.service.delete((req.validated.params as TierParams).id);
    res.status(204).end();
  };
}
