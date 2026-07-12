namespace Ports.Services;

public interface IUserPoolService
{
    public Task<bool> EmailExistsInUserPool(string email, string userPoolId);
}