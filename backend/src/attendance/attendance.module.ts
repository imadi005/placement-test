import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { TeacherClassesModule } from "../teacher-classes/teacher-classes.module";

@Module({
  imports: [TeacherClassesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
