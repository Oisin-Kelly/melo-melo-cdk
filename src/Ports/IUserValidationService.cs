namespace Ports;

public interface IUserValidationService
{
    public bool ValidateUsername(string username);
    public bool ValidateEmail(string email);
}