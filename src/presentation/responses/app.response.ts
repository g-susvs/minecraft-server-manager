import type { Response } from 'express';

export class AppResponse {
  constructor(res: Response, data: object = {}, message: string = '') {
    res.status(200).json({
      message,
      success: true,
      data,
    });
  }
}
