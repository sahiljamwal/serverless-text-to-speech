import { DynamoDB, SNS } from "aws-sdk";
import { randomUUID } from "crypto";

const dynamodb = new DynamoDB.DocumentClient();
const sns = new SNS();

export const handler = async (event: { text: string; voice: string }) => {
  try {
    const recordId = randomUUID();
    const { voice, text } = event;

    if (!voice || !text) {
      throw new Error("either voice or text not provided");
    }

    console.log(`Generating new DynamoDB record, with ID: ${recordId}`);
    console.log(`Input Text: ${text}`);
    console.log(`Selected voice: ${voice}`);

    // Creating new record in DynamoDB table
    await dynamodb
      .put({
        TableName: process.env.DB_TABLE_NAME!,
        Item: {
          id: recordId,
          text: text,
          voice: voice,
          status: "PROCESSING",
        },
      })
      .promise();

    // Sending notification about new post to SNS
    await sns
      .publish({
        TopicArn: process.env.SNS_TOPIC!,
        Message: recordId,
      })
      .promise();

    return recordId;
  } catch (err) {
    console.error(err);
    throw err;
  }
};
