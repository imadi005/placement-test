import { Module } from "@nestjs/common";
import { TeacherClassesController } from "./teacher-classes.controller";
import { TeacherClassesService } from "./teacher-classes.service";

@Module({
  controllers: [TeacherClassesController],
  providers: [TeacherClassesService],
  exports: [TeacherClassesService],
})
export class TeacherClassesModule {}
