import prisma from "../src/lib/prisma";
(async () => {
  const p = await prisma.photo.findFirst({ where: { userId: "81738a9d-63f3-49d3-896a-76d717b49e8e", isPrimary: true }});
  console.log(p?.url);
  const s1 = await prisma.characterSheet.findFirst({ where: { userId: "81738a9d-63f3-49d3-896a-76d717b49e8e", type: "poses", status: "complete" }, orderBy: { createdAt: "desc" }});
  const s2 = await prisma.characterSheet.findFirst({ where: { userId: "81738a9d-63f3-49d3-896a-76d717b49e8e", type: "3d_360", status: "complete" }, orderBy: { createdAt: "desc" }});
  console.log("poses:", s1?.compositeUrl);
  console.log("360:", s2?.compositeUrl);
})().finally(()=>prisma.$disconnect());
