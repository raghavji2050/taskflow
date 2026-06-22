import { deliverDueScheduledMessages } from "../lib/scheduled-messages";

async function main() {
  const result = await deliverDueScheduledMessages();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
