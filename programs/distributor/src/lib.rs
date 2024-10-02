use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::Metadata;
use anchor_spl::token::{Token};
use nft_ct::cpi::accounts::CreateNFT;
use nft_ct::program::NftCt;
use solana_program::sysvar::instructions;

declare_id!("9gqCftnKaG2pYswKbM1GfaMU57fptTw893V3bkAXdkJX");

#[account]
#[derive(Default)]
pub struct Distributor {

}

#[program]
pub mod distributor {
    use super::*;

    pub fn invoke_create_nft(
        ctx: Context<InvokeCreateSingleNft>,
        id: u64,
        name: String,
        symbol: String,
        uri: String,
        amount: u64
    ) -> Result<()> {
        if amount <  10000000 {
            return err!(Errors::InsufficientAmount);
        }
        
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(), 

            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.distributor.to_account_info(),
            }
        );

        let res = system_program::transfer(cpi_context, amount);

        if res.is_ok() {
            nft_ct::cpi::create_single_nft(ctx.accounts.create_nft_ctx(), id, name, symbol, uri)
        } else {
            return err!(Errors::TransferFailed);
        }
    }
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct InvokeCreateSingleNft<'info> {
    /// CHECK
    #[account(
        init_if_needed,
        seeds = [b"distributor"],
        bump,
        payer = payer, 
        space = 104
    )]
    pub distributor: Account<'info, Distributor>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: will be checked in the create_single_nft function
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,
    /// CHECK: will be checked in the create_single_nft function
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub metadata_program: Program<'info, Metadata>,
    /// CHECK: 
    #[account(address = instructions::id())]
    pub instruction_sysvar_account: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [
            b"metadata".as_ref(),
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        seeds::program = metadata_program.key()
    )]
    /// CHECK: Manual validation will be done in the handler
    pub nft_metadata: AccountInfo<'info>,
    /// CHECK: This is checked in the CPI
    #[account(
        mut,
        seeds = [
            b"metadata".as_ref(),
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
            b"edition".as_ref(),
        ],
        bump,
        seeds::program = metadata_program.key()
    )]
    pub master_edition_account: AccountInfo<'info>,
    pub nft_ct_program: Program<'info, NftCt>,
}

impl<'info> InvokeCreateSingleNft<'info> {
    pub fn create_nft_ctx(&self) -> CpiContext<'_, '_, '_, 'info, CreateNFT<'info>> {
        CpiContext::new(
            self.nft_ct_program.to_account_info(),
            CreateNFT {
                authority: self.authority.to_account_info(),
                payer: self.payer.to_account_info(),
                mint: self.mint.to_account_info(),
                instruction_sysvar_account: self.instruction_sysvar_account.to_account_info(),
                token_account: self.token_account.to_account_info(),
                associated_token_program: self.associated_token_program.to_account_info(),
                nft_metadata: self.nft_metadata.to_account_info(),
                master_edition_account: self.master_edition_account.to_account_info(),
                rent: self.rent.to_account_info(),
                token_program: self.token_program.to_account_info(),
                metadata_program: self.metadata_program.to_account_info(),
                system_program: self.system_program.to_account_info(),
            },
        )
    }
}

#[error_code]
pub enum Errors {
    #[msg("transfer failed")]
    TransferFailed,

    #[msg("insufficient amount")]
    InsufficientAmount,
}