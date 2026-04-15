import prisma from "../src/lib/prisma";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "dev@officialai.local" } });
  if (!user) { console.log("no dev user"); return; }
  console.log("Dev user id:", user.id);

  const photos = await prisma.photo.findMany({
    where: { userId: user.id },
    select: { id: true, url: true, isPrimary: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`Photos (${photos.length}):`);
  photos.forEach(p => console.log(`  ${p.isPrimary ? "★" : " "} ${p.id}  ${p.url.substring(0, 90)}`));

  const sheets = await prisma.characterSheet.findMany({
    where: { userId: user.id, status: "complete" },
    select: { id: true, type: true, compositeUrl: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`\nCompleted character sheets (${sheets.length}):`);
  sheets.forEach(s => console.log(`  ${s.type.padEnd(8)} ${s.id} ${s.compositeUrl?.substring(0, 70)}`));
}
main().finally(() => prisma.$disconnect());
