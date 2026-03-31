using Amazon.CDK;
using Amazon.CDK.AWS.DynamoDB;
using Constructs;

namespace MeloMeloCdk;

public class DataStack : BaseStack
{
    public ITable Table { get; }

    public DataStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
    {
        var table = new Table(this, "DynamoDBTable", new TableProps()
        {
            PartitionKey = new Attribute
            {
                Name = "PK",
                Type = AttributeType.STRING
            },
            SortKey = new Attribute
            {
                Name = "SK",
                Type = AttributeType.STRING
            },
            BillingMode = BillingMode.PAY_PER_REQUEST,
            TableName = $"melo-melo-table-{Env}",
            RemovalPolicy = DeletionPolicy,
        });

        table.AddGlobalSecondaryIndex(new GlobalSecondaryIndexProps()
        {
            IndexName = "GSI1",
            PartitionKey = new Attribute
            {
                Name = "GSI1PK",
                Type = AttributeType.STRING
            },
            SortKey = new Attribute
            {
                Name = "GSI1SK",
                Type = AttributeType.STRING
            },
            ProjectionType = ProjectionType.ALL
        });

        Table = table;
    }
}
