import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, teacher: true },
    });
  }
}
