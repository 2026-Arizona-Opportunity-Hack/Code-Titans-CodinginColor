import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * The four DynamoDB tables from docs/architecture.md section 6.
 * Key names are fixed here so every Lambda can rely on them:
 *   all tables:        pk, sk
 *   gsi attributes:    gsi1pk/gsi1sk, gsi2pk/gsi2sk, gsi3pk/gsi3sk
 *   TTL attribute:     ttl (epoch seconds) on core and events
 */
export class DataStack extends cdk.Stack {
  public readonly contentTable: dynamodb.Table;
  public readonly coreTable: dynamodb.Table;
  public readonly progressTable: dynamodb.Table;
  public readonly eventsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.contentTable = this.table("ContentTable");
    this.gsi(this.contentTable, "gsi1"); // module list: LIST#MOD -> MOD#<id> (META items only)

    this.coreTable = this.table("CoreTable", { ttl: true });
    this.gsi(this.coreTable, "gsi1"); // my classes: USR#<sub> -> CLS#<id>
    this.gsi(this.coreTable, "gsi2"); // cohort rollups: COH#<id> -> CLS#<id>
    this.gsi(this.coreTable, "gsi3"); // login: JOIN#<code> -> class

    this.progressTable = this.table("ProgressTable");
    this.gsi(this.progressTable, "gsi1"); // class module state: CLS#<id>#MOD#<id> -> STU#<id>
    this.gsi(this.progressTable, "gsi2"); // sparse: submissions awaiting review

    this.eventsTable = this.table("EventsTable", { ttl: true });

    new cdk.CfnOutput(this, "ContentTableName", { value: this.contentTable.tableName, description: "DynamoDB content table" });
    new cdk.CfnOutput(this, "CoreTableName", { value: this.coreTable.tableName, description: "DynamoDB core table" });
    new cdk.CfnOutput(this, "ProgressTableName", { value: this.progressTable.tableName, description: "DynamoDB progress table" });
    new cdk.CfnOutput(this, "EventsTableName", { value: this.eventsTable.tableName, description: "DynamoDB events table" });
  }

  private table(id: string, opts: { ttl?: boolean } = {}): dynamodb.Table {
    return new dynamodb.Table(this, id, {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: opts.ttl ? "ttl" : undefined,
    });
  }

  private gsi(table: dynamodb.Table, name: string): void {
    table.addGlobalSecondaryIndex({
      indexName: name,
      partitionKey: { name: `${name}pk`, type: dynamodb.AttributeType.STRING },
      sortKey: { name: `${name}sk`, type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
