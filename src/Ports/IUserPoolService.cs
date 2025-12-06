namespace Ports;

public interface IUserPoolService
{
    public Task<bool> EmailExistsInUserPool(string email);
}