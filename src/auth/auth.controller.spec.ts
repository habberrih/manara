import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CreateLoginDto } from './dto/create-login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    signup: jest.Mock;
    logout: jest.Mock;
    getJwtAccessToken: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      signup: jest.fn(),
      logout: jest.fn(),
      getJwtAccessToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates login to authService', async () => {
    const dto: CreateLoginDto = {
      email: 'user@example.com',
      password: 'password123',
    };
    const response = { accessToken: 'token' };
    authService.login.mockResolvedValue(response);

    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toBe(response);
  });

  it('delegates signup to authService', async () => {
    const dto = { email: 'user@example.com', password: 'Secret123!' };
    const response = { data: { id: 'user-1' } };
    authService.signup.mockResolvedValue(response);

    const result = await controller.signup(dto);

    expect(authService.signup).toHaveBeenCalledWith(dto);
    expect(result).toBe(response);
  });

  it('calls logout with current user id', async () => {
    authService.logout.mockResolvedValue(undefined);
    await controller.logout({ id: 'user-1' } as any);
    expect(authService.logout).toHaveBeenCalledWith('user-1');
  });

  it('refreshes access token via authService', async () => {
    authService.getJwtAccessToken.mockResolvedValue('new-token');

    const result = await controller.refreshToken({
      id: 'user-1',
      email: 'user@example.com',
    } as any);

    expect(authService.getJwtAccessToken).toHaveBeenCalledWith(
      'user-1',
      'user@example.com',
    );
    expect(result).toEqual({ accessToken: 'new-token' });
  });
});
