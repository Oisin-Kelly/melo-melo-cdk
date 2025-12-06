namespace Ports;

public interface IUserValidationService
{
    public void ValidateUsername(string username);
    public Task ValidateEmail(string email);
}