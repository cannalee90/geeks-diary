import { expect } from 'chai';
import { makeBasicAuthorizationHeader } from './authentication';


describe('libs.authentication', () => {
    describe('makeBasicAuthorizationHeader', () => {
        it('should return basic authorization header.', () => {
            const header = makeBasicAuthorizationHeader('user', 'password');

            expect(header).to.equal('Basic dXNlcjpwYXNzd29yZA==');
        });
    });
});
