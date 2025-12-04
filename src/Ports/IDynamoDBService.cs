namespace Ports;

public interface IDynamoDBService
{
    public Task WriteToDynamoAsync<T>(T value);
}