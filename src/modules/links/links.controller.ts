import type { Request, Response } from 'express';
import { currentClient } from '../../common/auth-middleware';
import { sendData, sendPage } from '../../common/response';
import type {
  CreateLinkInput,
  LinkParams,
  ListLinksQuery,
  RedirectParams,
  UpdateLinkInput,
} from './links.schemas';
import type { LinksService } from './links.service';

export class LinksController {
  constructor(private readonly service: LinksService) {}

  create = async (req: Request, res: Response) => {
    const link = await this.service.create(
      currentClient(req).id,
      req.validated.body as CreateLinkInput,
    );
    sendData(res, link, 201);
  };

  list = async (req: Request, res: Response) => {
    const query = req.validated.query as ListLinksQuery;
    sendPage(res, await this.service.list(currentClient(req).id, query));
  };

  get = async (req: Request, res: Response) => {
    const { id } = req.validated.params as LinkParams;
    sendData(res, await this.service.get(currentClient(req).id, id));
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.validated.params as LinkParams;
    const input = req.validated.body as UpdateLinkInput;
    sendData(res, await this.service.update(currentClient(req).id, id, input));
  };

  delete = async (req: Request, res: Response) => {
    const { id } = req.validated.params as LinkParams;
    await this.service.delete(currentClient(req).id, id);
    res.status(204).end();
  };

  redirect = async (req: Request, res: Response) => {
    const { code } = req.validated.params as RedirectParams;
    res.redirect(302, await this.service.resolve(code));
  };
}
