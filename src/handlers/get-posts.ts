import { DynamoDB } from "aws-sdk";

const dynamodb = new DynamoDB.DocumentClient();

export const handler = async (event: any) => {
  try {
    const postId = event.postId;

    // Query for a specific postId
    const queryResult = await dynamodb
      .query({
        TableName: process.env.DB_TABLE_NAME!,
        KeyConditionExpression: "id = :postId",
        ExpressionAttributeValues: {
          ":postId": postId,
        },
      })
      .promise();

    const items = queryResult.Items;

    return items;
  } catch (err) {
    console.error(err);
    throw err;
  }
};
