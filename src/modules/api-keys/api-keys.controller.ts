import type { Request, Response } from 'express';
import { currentClient } from '../../common/auth-middleware';
import { sendData, sendPage } from '../../common/response';
import type {
  ApiKeyParams,
  CreateApiKeyInput,
  ListApiKeysQuery,
  UpdateApiKeyInput,
} from './api-keys.schemas';
import type { ApiKeysService } from './api-keys.service';

export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  create = async (req: Request, res: Response) => {
    sendData(res, await this.service.create(req.validated.body as CreateApiKeyInput), 201);
  };

  list = async (req: Request, res: Response) => {
    sendPage(res, await this.service.list(req.validated.query as ListApiKeysQuery));
  };

  get = async (req: Request, res: Response) => {
    sendData(res, await this.service.get((req.validated.params as ApiKeyParams).id));
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.validated.params as ApiKeyParams;
    sendData(res, await this.service.update(id, req.validated.body as UpdateApiKeyInput));
  };

  revoke = async (req: Request, res: Response) => {
    sendData(res, await this.service.revoke((req.validated.params as ApiKeyParams).id));
  };

  /** The calling client's own key. */
  me = async (req: Request, res: Response) => {
    sendData(res, await this.service.get(currentClient(req).id));
  };
}
