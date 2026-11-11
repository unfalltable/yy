import idle from '../assets/motions/idle-01.vrma?url';
import speaking from '../assets/motions/speaking-01.vrma?url';
import cheer from '../assets/motions/success-cheer.vrma?url';
export const avatarMotions = { idle, speaking, cheer } as const;
export type AvatarMotion = keyof typeof avatarMotions;
