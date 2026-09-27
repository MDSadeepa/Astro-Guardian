import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting seed...");
    
    // 1. Get the first user (assuming the user has logged in once via GitHub)
    let user = await prisma.user.findFirst();
    
    if (!user) {
        console.log("No user found! Creating a dummy 'demo_user' so we can attach data...");
        user = await prisma.user.create({
            data: { githubId: "9999999", username: "demo_user", avatar: "https://github.com/identicons/demo.png" }
        });
    }
    
    console.log(`Seeding data for User: ${user.username}...`);

    // 2. Ensure an Installation exists
    let installation = await prisma.installation.findFirst({
        where: { userId: user.id }
    });

    if (!installation) {
        installation = await prisma.installation.create({
            data: {
                githubId: "123456789",
                userId: user.id
            }
        });
    }

    // 3. Ensure a Repository exists
    let repo = await prisma.repository.findFirst({
        where: { installationId: installation.id }
    });

    if (!repo) {
        repo = await prisma.repository.create({
            data: {
                githubId: "987654321",
                name: "demo-vulnerable-app",
                owner: user.username,
                defaultBranch: "main",
                healthScore: 65,
                installationId: installation.id
            }
        });
    } else {
        // Update health score to look realistic
        await prisma.repository.update({
            where: { id: repo.id },
            data: { healthScore: 76 }
        });
    }

    console.log(`Using repository: ${repo.name}...`);

    // 4. Create fake Scan Jobs
    console.log("Creating 1,284 fake scan jobs... (This might take a second)");
    
    // Prisma createMany is fast. Let's do batches.
    const scanJobsData = Array.from({ length: 1284 }).map((_, i) => ({
        repositoryId: repo.id,
        status: i % 10 === 0 ? "failed" : "success",
        stage: "Finished",
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)) // Random date in last 7 days
    }));

    await prisma.scanJob.createMany({
        data: scanJobsData
    });
    
    // We need a specific scan job to attach findings to
    const recentScan = await prisma.scanJob.create({
        data: {
            repositoryId: repo.id,
            status: "success",
            stage: "Finished"
        }
    });

    // 5. Create Auto-Fix Findings
    console.log("Creating 342 auto-fixed findings...");
    const findingsData = Array.from({ length: 342 }).map((_, i) => ({
        scanJobId: recentScan.id,
        type: i % 2 === 0 ? "OSV" : "Gitleaks",
        severity: "HIGH",
        title: "Mock Vulnerability",
        affectedFile: "package.json",
        canAutoFix: true,
        isFixed: true // This is what the dashboard counts!
    }));

    await prisma.finding.createMany({
        data: findingsData
    });

    console.log("✅ Seeding complete! Check your dashboard!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
