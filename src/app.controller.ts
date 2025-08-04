import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('favicon.ico')
  getFavicon(@Res() res: Response) {
    return res.status(204).send(); // No Content
  }

  @Get('robots.txt')
  getRobots(@Res() res: Response) {
    return res.type('text/plain').send('User-agent: *\nDisallow: /');
  }

  @Get('.well-known/security.txt')
  getSecurityTxt(@Res() res: Response) {
    return res.type('text/plain').send('');
  }

}
