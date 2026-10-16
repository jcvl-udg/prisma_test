import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { graphql } from '../../gql';

const ME_QUERY = graphql(`
  query Me {
    me {
      id
      email
      name
      image
      role
    }
  }
`);

export function useMe() {
  const { data: session, status } = useSession();
  const { data, loading, error } = useQuery(ME_QUERY, {
    skip: status !== 'authenticated',
    fetchPolicy: 'cache-first',
  });

  return {
    user: status === 'authenticated' ? data?.me ?? session?.user : null,
    status,
    loading: status === 'loading' || (status === 'authenticated' && loading),
    error,
  };
}
