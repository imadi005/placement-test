import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AnalyticsFilters, AnalyticsService } from "./analytics.service";

@Controller("tests/:testId/analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("coordinator", "admin")
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  private parseFilters(query: Record<string, string>): AnalyticsFilters {
    return {
      batch: query.batch || undefined,
      section: query.section || undefined,
      hasViolations: query.hasViolations === "true",
    };
  }

  @Get()
  get(@Param("testId") testId: string, @Query() query: Record<string, string>) {
    return this.analyticsService.getAnalytics(testId, this.parseFilters(query));
  }

  @Get("export")
  async export(@Param("testId") testId: string, @Query() query: Record<string, string>, @Res() res: Response) {
    const { workbook, data } = await this.analyticsService.buildWorkbook(testId, this.parseFilters(query));
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
