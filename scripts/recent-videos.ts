import prisma from "../src/lib/prisma";

(async () => {
  const user = await prisma.user.findUnique({ where: { email: "dev@officialai.local" } });
  if (!user) { console.log("no dev user"); return; }

  const videos = await prisma.video.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      status: true,
      videoUrl: true,
      createdAt: true,
      contentType: true,
    },
  });

  videos.forEach((v, i) => {
    console.log(`\n${i + 1}. ${v.title} (${v.contentType})`);
    console.log(`   id:        ${v.id}`);
    console.log(`   status:    ${v.status}`);
    console.log(`   createdAt: ${v.createdAt.toISOString()}`);
    console.log(`   url:       ${v.videoUrl || "(none)"}`);
  });
})().finally(() => prisma.$disconnect());
