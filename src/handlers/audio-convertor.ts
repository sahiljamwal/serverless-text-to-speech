import { DynamoDB, Polly, S3 } from "aws-sdk";
import { createReadStream, existsSync, writeFileSync } from "fs";
import { join } from "path";

const dynamodb = new DynamoDB.DocumentClient();
const polly = new Polly();
const s3 = new S3();

export const handler = async (event: any): Promise<void> => {
  try {
    const postId = event.Records[0].Sns.Message;

    console.log(`Text to Speech function. Post ID in DynamoDB: ${postId}`);

    // Retrieving information about the post from DynamoDB table
    const tableName = process.env.DB_TABLE_NAME!;

    const postItem = await dynamodb
      .query({
        TableName: tableName,
        KeyConditionExpression: "id = :postId",
        ExpressionAttributeValues: {
          ":postId": postId,
        },
      })
      .promise();

    if (!postItem.Items || postItem.Items.length === 0) {
      throw new Error("No item found in DynamoDB for the provided postId");
    }

    const { text, voice } = postItem.Items[0];
    let rest = text;

    // Dividing the post into blocks of approximately 2500 characters
    const textBlocks: string[] = [];
    while (rest.length > 2600) {
      let end = rest.indexOf(".", 2500);

      if (end === -1) {
        end = rest.indexOf(" ", 2500);
      }

      const textBlock = rest.substring(0, end);
      rest = rest.substring(end);
      textBlocks.push(textBlock);
    }
    textBlocks.push(rest);

    // For each block, invoke Polly API to transform text into audio
    const output = join("/tmp/", postId);

    for (const textBlock of textBlocks) {
      const response = await polly
        .synthesizeSpeech({
          OutputFormat: "mp3",
          Text: textBlock,
          VoiceId: voice,
        })
        .promise();

      // Save the audio stream returned by Amazon Polly
      if (response.AudioStream) {
        const mode = existsSync(output) ? "a" : "w";
        writeFileSync(output, response.AudioStream as Buffer, { flag: mode });
      }
    }

    // Uploading the file to S3
    const bucketName = process.env.BUCKET_NAME!;

    await s3
      .putObject({
        Bucket: bucketName,
        Key: `${postId}.mp3`,
        Body: createReadStream(output),
        ACL: "public-read",
      })
      .promise();

    const location = await s3
      .getBucketLocation({ Bucket: bucketName })
      .promise();
    const region = location.LocationConstraint || "us-east-1";

    const url = `https://${
      region === "us-east-1" ? "s3" : `s3-${region}`
    }.amazonaws.com/${bucketName}/${postId}.mp3`;

    // Updating the item in DynamoDB
    await dynamodb
      .update({
        TableName: tableName,
        Key: { id: postId },
        UpdateExpression: "SET #statusAtt = :statusValue, #urlAtt = :urlValue",
        ExpressionAttributeValues: {
          ":statusValue": "UPDATED",
          ":urlValue": url,
        },
        ExpressionAttributeNames: {
          "#statusAtt": "status",
          "#urlAtt": "url",
        },
      })
      .promise();

    console.log(`Successfully processed and updated post ID ${postId}`);
  } catch (err) {
    console.error(err);
  }
};
