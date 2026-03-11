import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create a demo organization
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Organization",
      slug: "demo",
    },
  });

  console.log("Created organization:", org.name);

  // Create a demo agent
  const agent = await prisma.agent.upsert({
    where: { id: "demo-agent" },
    update: {},
    create: {
      id: "demo-agent",
      organizationId: org.id,
      name: "Amharic Support Agent",
      description: "Default Amharic-speaking AI agent",
      language: "am",
      status: "active",
      systemPrompt: `You are a helpful customer service agent that speaks Amharic (አማርኛ).
You work for the organization and help callers with their questions.
Always be polite, professional, and helpful.
If you cannot help the caller, offer to transfer them to a human agent.
Respond in Amharic unless the caller speaks English.`,
    },
  });

  console.log("Created agent:", agent.name);
  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
