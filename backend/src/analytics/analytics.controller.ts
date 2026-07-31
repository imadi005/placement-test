import { Controller, Get, Param, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AnalyticsService } from "./analytics.service";

@Controller("tests/:testId/analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("coordinator", "admin")
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get()
  get(@Param("testId") testId: string) {
    return this.analyticsService.getAnalytics(testId);
  }

  @Get("export")
  async export(@Param("testId") testId: string, @Res() res: Response) {
    const { workbook, data } = await this.analyticsService.buildWorkbook(testId);
    const filename = `${data.test.title.replace(/[^a-z0-9]+/gi, "-")}-report.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  }
}
